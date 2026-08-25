import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class DemandDto {
  @IsString()
  city: string;

  @IsNumber()
  demand: number;

  @IsString()
  unit: string;
}

export class PackageBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DemandDto)
  demands: DemandDto[];

  @IsString()
  validUntil: string;

  @IsOptional()
  metaContent?: unknown;

  @IsOptional()
  constraints?: unknown;
}

export class EventPayloadDto {
  @IsUUID()
  idpk: string;

  @IsString()
  type: string;

  @ValidateNested()
  @Type(() => PackageBodyDto)
  packageBody: PackageBodyDto;
}
