import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { UserModel } from '../../database/models';
import { UserExistsGuard } from './guards/user-exists.guard';
import { UsersRepository } from './users.repository';

@Module({
  imports: [SequelizeModule.forFeature([UserModel])],
  providers: [UsersRepository, UserExistsGuard],
  exports: [UsersRepository, UserExistsGuard],
})
export class UsersModule {}
