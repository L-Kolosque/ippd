import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task } from './entities/task.entity';

export const TASKS_DATA_FILE = 'TASKS_DATA_FILE';

@Injectable()
export class TasksService {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(@Inject(TASKS_DATA_FILE) private readonly dataFilePath: string) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    this.validateTaskFields(createTaskDto, true);

    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const task: Task = {
        id: randomUUID(),
        descricao: createTaskDto.descricao,
        inicio: createTaskDto.inicio,
        fim: createTaskDto.fim,
      };
      tasks.push(task);
      await this.writeTasks(tasks);
      return task;
    });
  }

  async findAll(): Promise<Task[]> {
    return this.readTasks();
  }

  async findOne(id: string): Promise<Task> {
    const task = (await this.readTasks()).find((item) => item.id === id);
    if (!task) {
      throw new NotFoundException(`Tarefa ${id} não encontrada.`);
    }
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    this.validateCompleteTaskFields(updateTaskDto);

    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new NotFoundException(`Tarefa ${id} não encontrada.`);
      }

      const task: Task = {
        id,
        descricao: updateTaskDto.descricao,
        inicio: updateTaskDto.inicio,
        fim: updateTaskDto.fim,
        ...(updateTaskDto.status === undefined
          ? {}
          : { status: updateTaskDto.status }),
        ...(updateTaskDto.resultado === undefined
          ? {}
          : { resultado: updateTaskDto.resultado }),
      };
      tasks[index] = task;
      await this.writeTasks(tasks);
      return task;
    });
  }

  async patch(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    this.validateTaskFields(updateTaskDto, false);

    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new NotFoundException(`Tarefa ${id} não encontrada.`);
      }

      const task = Object.assign({}, tasks[index], updateTaskDto);
      tasks[index] = task;
      await this.writeTasks(tasks);
      return task;
    });
  }

  async remove(id: string): Promise<Task> {
    return this.mutate(async () => {
      const tasks = await this.readTasks();
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new NotFoundException(`Tarefa ${id} não encontrada.`);
      }

      const [removedTask] = tasks.splice(index, 1);
      await this.writeTasks(tasks);
      return removedTask;
    });
  }

  private async readTasks(): Promise<Task[]> {
    const contents = await readFile(this.dataFilePath, 'utf8');
    let tasks: unknown;

    try {
      tasks = JSON.parse(contents);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException(
          'O arquivo de tarefas contém JSON inválido.',
        );
      }
      throw error;
    }

    if (!Array.isArray(tasks) || !tasks.every((task) => this.isTask(task))) {
      throw new InternalServerErrorException(
        'O arquivo de tarefas possui um formato inválido.',
      );
    }

    return tasks;
  }

  private async writeTasks(tasks: Task[]): Promise<void> {
    await writeFile(this.dataFilePath, JSON.stringify(tasks, null, 2), 'utf8');
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private validateTaskFields(
    task: CreateTaskDto | UpdateTaskDto,
    requireCoreFields: boolean,
  ): void {
    const requiredFields = ['descricao', 'inicio', 'fim'] as const;
    for (const field of requiredFields) {
      const value = task[field];
      if (requireCoreFields && typeof value !== 'string') {
        throw new BadRequestException(`O campo "${field}" é obrigatório.`);
      }
      if (value !== undefined && typeof value !== 'string') {
        throw new BadRequestException(`O campo "${field}" deve ser texto.`);
      }
    }

    if (
      'status' in task &&
      task.status !== undefined &&
      typeof task.status !== 'string'
    ) {
      throw new BadRequestException('O campo "status" deve ser texto.');
    }
    if (
      'resultado' in task &&
      task.resultado !== undefined &&
      typeof task.resultado !== 'string'
    ) {
      throw new BadRequestException('O campo "resultado" deve ser texto.');
    }
  }

  private validateCompleteTaskFields(
    task: UpdateTaskDto,
  ): asserts task is UpdateTaskDto &
    Pick<CreateTaskDto, 'descricao' | 'inicio' | 'fim'> {
    this.validateTaskFields(task, true);
  }

  private isTask(value: unknown): value is Task {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      !('descricao' in value) ||
      !('inicio' in value) ||
      !('fim' in value)
    ) {
      return false;
    }

    const task = value as Record<string, unknown>;
    return (
      typeof task.id === 'string' &&
      typeof task.descricao === 'string' &&
      typeof task.inicio === 'string' &&
      typeof task.fim === 'string' &&
      (task.status === undefined || typeof task.status === 'string') &&
      (task.resultado === undefined || typeof task.resultado === 'string')
    );
  }
}
