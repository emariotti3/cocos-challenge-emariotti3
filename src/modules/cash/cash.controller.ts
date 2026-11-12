import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OrderResponseDto } from '../orders/dto/order.response.dto';
import { RequestUser } from '../users/decorators/request-user.decorator';
import { UserExistsGuard } from '../users/guards/user-exists.guard';
import type { UserRecord } from '../users/users.repository';
import { CashService } from './cash.service';
import { CashMovementDto } from './dto/cash-movement.dto';

@ApiTags('cash')
@ApiParam({ name: 'userId', type: Number, example: 1 })
@ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
@ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
@Controller('users/:userId/cash')
@UseGuards(UserExistsGuard)
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Post('deposits')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Deposit cash (CASH_IN)',
    description:
      'Records an incoming transfer as a FILLED order with side CASH_IN on the ARS instrument (price 1, size = amount). Settles immediately.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto, description: 'CASH_IN order, status FILLED' })
  deposit(
    @RequestUser() user: UserRecord,
    @Body() dto: CashMovementDto,
  ): Promise<OrderResponseDto> {
    return this.cash.deposit(user, dto);
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Withdraw cash (CASH_OUT)',
    description:
      'Records an outgoing transfer as an order with side CASH_OUT. Checked against *available* cash (total minus pending LIMIT BUY reservations) under the same per-user lock as order placement. Insufficient cash is persisted as REJECTED and still returns 201.',
  })
  @ApiCreatedResponse({
    type: OrderResponseDto,
    description: 'CASH_OUT order, status FILLED or REJECTED (INSUFFICIENT_FUNDS)',
  })
  withdraw(
    @RequestUser() user: UserRecord,
    @Body() dto: CashMovementDto,
  ): Promise<OrderResponseDto> {
    return this.cash.withdraw(user, dto);
  }
}
