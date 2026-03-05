import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'noNullBytes', async: false })
export class NoNullBytesValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return true;
    return !value.includes('\0');
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must not contain null bytes`;
  }
}
