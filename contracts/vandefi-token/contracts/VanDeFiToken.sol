// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title VanDeFiToken
 * @notice Token de comunidad y recompensas de VanDeFi en redes EVM.
 *
 * Este contrato NO es USDC, NO tiene paridad con el dólar, NO representa
 * depósitos o participaciones societarias y NO mueve fondos de remesas.
 *
 * - Emisión fija, determinada al desplegar y entregada a la tesorería indicada.
 * - Sin propietario privilegiado, mint futuro, impuestos, listas negras,
 *   congelamiento, proxy ni funciones de retiro arbitrario.
 * - Los usos comerciales/rewards se implementarán por separado, con
 *   reglas públicas y revisión legal antes de habilitarse.
 */
contract VanDeFiToken is ERC20 {
    error TreasuryAddressRequired();
    error InitialSupplyRequired();

    address public immutable initialTreasury;

    /**
     * @param treasury_ Tesorería que recibe el 100% de la emisión inicial.
     * @param initialSupplyWholeTokens_ Cantidad de tokens enteros, con
     *        18 decimales agregados por el contrato. No hay valor predefinido.
     */
    constructor(address treasury_, uint256 initialSupplyWholeTokens_)
        ERC20("VanDeFi", "VDFI")
    {
        if (treasury_ == address(0)) revert TreasuryAddressRequired();
        if (initialSupplyWholeTokens_ == 0) revert InitialSupplyRequired();

        initialTreasury = treasury_;
        _mint(treasury_, initialSupplyWholeTokens_ * 10 ** decimals());
    }
}
