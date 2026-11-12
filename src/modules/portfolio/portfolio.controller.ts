import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequestUser } from '../users/decorators/request-user.decorator';
import { UserExistsGuard } from '../users/guards/user-exists.guard';
import type { UserRecord } from '../users/users.repository';
import { PortfolioResponseDto } from './dto/portfolio.response.dto';
import { PortfolioService } from './portfolio.service';

@ApiTags('portfolio')
@ApiParam({ name: 'userId', type: Number, example: 1 })
@Controller('users/:userId/portfolio')
@UseGuards(UserExistsGuard)
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  @ApiOperation({
    summary: 'Get a user portfolio',
    description:
      'Total account value, cash (total, reserved by pending LIMIT buys, available) and open positions valued at the latest close, with weighted-average cost and returns. Derived entirely from the orders ledger.',
  })
  @ApiOkResponse({ type: PortfolioResponseDto })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  getPortfolio(@RequestUser() user: UserRecord): Promise<PortfolioResponseDto> {
    return this.portfolio.getPortfolio(user);
  }
}
