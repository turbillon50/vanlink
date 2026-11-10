-- Isolated design fixture. This schema is outside db/migrations.
CREATE SCHEMA vd_model;

CREATE TABLE vd_model.security_domain (
  parent_org_id text PRIMARY KEY,
  governance text NOT NULL CHECK (governance IN ('platform', 'independent')),
  UNIQUE (parent_org_id, governance)
);

CREATE TABLE vd_model.brand (
  brand_id text PRIMARY KEY,
  operating_model text NOT NULL CHECK (operating_model IN ('first_party', 'managed', 'independent')),
  parent_org_id text NOT NULL,
  governance text GENERATED ALWAYS AS (
    CASE WHEN operating_model = 'independent' THEN 'independent' ELSE 'platform' END
  ) STORED,
  FOREIGN KEY (parent_org_id, governance) REFERENCES vd_model.security_domain(parent_org_id, governance)
);
CREATE UNIQUE INDEX independent_brand_parent ON vd_model.brand(parent_org_id) WHERE operating_model = 'independent';
CREATE UNIQUE INDEX first_party_parent ON vd_model.brand(parent_org_id) WHERE operating_model = 'first_party';

CREATE TABLE vd_model.holder (
  holder_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('person', 'merchant', 'platform'))
);

CREATE TABLE vd_model.login_identity (
  issuer text NOT NULL,
  subject text NOT NULL,
  holder_id text NOT NULL REFERENCES vd_model.holder,
  PRIMARY KEY (issuer, subject)
);

CREATE TABLE vd_model.security_space (
  sub_org_id text PRIMARY KEY,
  parent_org_id text NOT NULL REFERENCES vd_model.security_domain,
  holder_id text NOT NULL REFERENCES vd_model.holder,
  UNIQUE (parent_org_id, holder_id)
);

CREATE TABLE vd_model.wallet (
  wallet_id text PRIMARY KEY,
  sub_org_id text NOT NULL REFERENCES vd_model.security_space,
  purpose text NOT NULL CHECK (purpose IN ('personal', 'treasury'))
);

CREATE TABLE vd_model.customer (
  brand_id text NOT NULL REFERENCES vd_model.brand,
  holder_id text NOT NULL REFERENCES vd_model.holder,
  PRIMARY KEY (brand_id, holder_id)
);

CREATE TABLE vd_model.membership (
  brand_id text NOT NULL REFERENCES vd_model.brand,
  holder_id text NOT NULL REFERENCES vd_model.holder,
  role text NOT NULL CHECK (role IN ('brand_admin', 'associate', 'support')),
  PRIMARY KEY (brand_id, holder_id, role)
);

CREATE TABLE vd_model.origination (
  brand_id text NOT NULL,
  contract_ref text NOT NULL,
  customer_holder_id text NOT NULL,
  associate_holder_id text NOT NULL,
  associate_role text GENERATED ALWAYS AS ('associate'::text) STORED,
  PRIMARY KEY (brand_id, contract_ref),
  FOREIGN KEY (brand_id, customer_holder_id) REFERENCES vd_model.customer,
  FOREIGN KEY (brand_id, associate_holder_id, associate_role) REFERENCES vd_model.membership
);

-- Trusted backend sets the authenticated issuer/subject and selected brand with
-- SET LOCAL in one transaction. HTTP clients never get a SQL connection.
-- Expose only this view to a dedicated report reader; base tables stay private.
CREATE VIEW vd_model.visible_contracts WITH (security_barrier = true) AS
SELECT o.brand_id, o.contract_ref
FROM vd_model.origination o
WHERE o.brand_id = current_setting('vandefi.brand', true)
  AND EXISTS (
    SELECT 1 FROM vd_model.login_identity i
    JOIN vd_model.membership m ON m.holder_id = i.holder_id AND m.brand_id = o.brand_id
    WHERE i.issuer = current_setting('vandefi.issuer', true)
      AND i.subject = current_setting('vandefi.subject', true)
      AND (m.role = 'brand_admin' OR (m.role = 'associate' AND m.holder_id = o.associate_holder_id))
  );
