import { Logger } from '@nestjs/common';

// Unit tests exercise services that log; keep the test output readable.
Logger.overrideLogger(false);
