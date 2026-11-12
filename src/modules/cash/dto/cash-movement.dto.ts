import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';
import { MAX_CASH_AMOUNT } from '../../../common/domain/constants';

/**
 * Cash movements follow the dataset convention: one `orders` row with
 * `price = 1` and `size = amount`, so the amount is a whole number of ARS
 * (`size` is an INTEGER column). Cents would require `size = 1, price =
 * amount`; see ADR-017.
 */

export class CashMovementDto {
  @ApiProperty({
    example: 100000,
    minimum: 1,
    maximum: MAX_CASH_AMOUNT,
    description: 'Whole ARS to move (integer)',
  })
  @Max(MAX_CASH_AMOUNT)
  @IsPositive()
  @IsInt({ message: 'amount must be a positive whole number of ARS' })
  amount!: number;
}
