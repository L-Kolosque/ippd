import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TASKS_DATA_FILE } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [
    TasksService,
    {
      provide: TASKS_DATA_FILE,
      useFactory: () => join(process.cwd(), 'data', 'tasks.json'),
    },
  ],
})
export class TasksModule {}
