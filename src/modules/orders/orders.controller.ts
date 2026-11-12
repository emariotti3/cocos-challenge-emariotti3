import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ParsePositiveIntPipe } from '../../common/pipes/parse-positive-int.pipe';
import { RequestUser } from '../users/decorators/request-user.decorator';
import { UserExistsGuard } from '../users/guards/user-exists.guard';
import type { UserRecord } from '../users/users.repository';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { OrderListResponseDto, OrderResponseDto } from './dto/order.response.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiParam({ name: 'userId', type: Number, example: 1 })
@ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
@Controller('users/:userId/orders')
@UseGuards(UserExistsGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place an order',
    description:
      'Send `size` (shares) or `amount` (ARS budget converted to whole shares). MARKET orders execute at the last close and return FILLED; LIMIT orders need `price` and return NEW. Orders exceeding available cash (BUY) or available shares (SELL) are saved and returned as REJECTED with a `rejectionReason`, still with HTTP 201.',
  })
  @ApiCreatedResponse({
    type: OrderResponseDto,
    description: 'Order persisted (FILLED, NEW or REJECTED)',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND | INSTRUMENT_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'NOT_TRADABLE | NO_MARKET_PRICE | AMOUNT_TOO_SMALL | ORDER_TOO_LARGE',
  })
  place(@RequestUser() user: UserRecord, @Body() dto: PlaceOrderDto): Promise<OrderResponseDto> {
    return this.orders.placeOrder(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List orders (newest first, cursor paginated)' })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(
    @RequestUser() user: UserRecord,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderListResponseDto> {
    return this.orders.listOrders(user, query);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get one order' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND | ORDER_NOT_FOUND' })
  get(
    @RequestUser() user: UserRecord,
    @Param('orderId', new ParsePositiveIntPipe('orderId')) orderId: number,
  ): Promise<OrderResponseDto> {
    return this.orders.getOrder(user, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a NEW order' })
  @ApiOkResponse({ type: OrderResponseDto, description: 'Order is now CANCELLED' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND | ORDER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ORDER_NOT_CANCELLABLE (order is not NEW)' })
  cancel(
    @RequestUser() user: UserRecord,
    @Param('orderId', new ParsePositiveIntPipe('orderId')) orderId: number,
  ): Promise<OrderResponseDto> {
    return this.orders.cancelOrder(user, orderId);
  }
}
