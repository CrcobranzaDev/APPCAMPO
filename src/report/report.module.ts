import { Module }                    from '@nestjs/common';
import { ExcelGestionesController }  from './report.controller';
import { ExcelGestionesService }     from './report.service';

@Module({
  controllers: [ExcelGestionesController],
  providers:   [ExcelGestionesService],
  exports:     [ExcelGestionesService],
})
export class ExcelGestionesModule {}