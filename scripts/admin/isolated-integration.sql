-- Execute only on the command-center preview branch. All fixtures roll back.
DO $$
DECLARE cid uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM command_environment WHERE environment='preview' AND neon_branch_id='br-crimson-wave-bcwz552e') THEN RAISE EXCEPTION 'wrong_test_environment'; END IF;
 BEGIN
 INSERT INTO command_cases(id,environment,title,priority,created_by) VALUES(cid,'test','synthetic integration case','normal','synthetic_operator');
 UPDATE command_cases SET status='investigating',version=version+1 WHERE id=cid AND version=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'optimistic_update_failed'; END IF;
 UPDATE command_cases SET status='resolved' WHERE id=cid AND version=1;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'stale_version_accepted'; END IF;
 INSERT INTO command_audit(id,environment,actor_id,permission,resource,reason,result,request_id) VALUES(aid,'test','synthetic_operator','cases.write',cid::text,'isolated rollback integration','completed','synthetic_integration');
 BEGIN UPDATE command_audit SET result='tampered' WHERE id=aid; RAISE EXCEPTION 'audit_mutable'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'audit_immutable' THEN RAISE; END IF; END;
 INSERT INTO command_action_keys(environment,actor_id,idempotency_key,input_hash,response) VALUES('test','synthetic_operator','integration_key','hash','{}');
 BEGIN INSERT INTO command_action_keys(environment,actor_id,idempotency_key,input_hash) VALUES('test','synthetic_operator','integration_key','other'); RAISE EXCEPTION 'duplicate_key_accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO command_jobs(environment,kind,resource_id,actor_id) VALUES('test','refresh','synthetic_account','synthetic_operator');
 BEGIN INSERT INTO command_jobs(environment,kind,resource_id,actor_id) VALUES('test','refresh','synthetic_account','synthetic_operator'); RAISE EXCEPTION 'duplicate_active_job_accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO command_events(environment,chain_id,tx_hash,log_index,block_number,block_hash,sender,recipient,amount_raw,contract,state) VALUES('test',137,'synthetic_hash',0,1,'synthetic_block','synthetic_sender','synthetic_recipient',900719925474099312345678,'synthetic_contract','confirmed');
 IF (SELECT amount_raw::text FROM command_events WHERE environment='test' AND tx_hash='synthetic_hash')<>'900719925474099312345678' THEN RAISE EXCEPTION 'precision_lost'; END IF;
 INSERT INTO command_role_grants(environment,clerk_user_id,role,granted_by,reason) VALUES('test','synthetic_user','auditor','synthetic_operator','isolated integration');
 BEGIN INSERT INTO command_role_grants(environment,clerk_user_id,role,granted_by,reason) VALUES('test','synthetic_user','owner','synthetic_operator','isolated integration'); RAISE EXCEPTION 'ambiguous_role_accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback_all_test_fixtures';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 IF EXISTS(SELECT 1 FROM command_cases WHERE id=cid) OR EXISTS(SELECT 1 FROM command_audit WHERE id=aid) THEN RAISE EXCEPTION 'rollback_incomplete'; END IF;
END $$;
