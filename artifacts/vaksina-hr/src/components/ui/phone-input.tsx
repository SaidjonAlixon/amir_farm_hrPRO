import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  formatUzPhoneInput,
  UZ_PHONE_PLACEHOLDER,
  digitsOnly,
} from '@/lib/phone';

type PhoneInputProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  value?: string;
  onChange?: (value: string) => void;
};

/**
 * Faqat O‘zbekiston raqami: +998 XX XXX XX XX (koddan keyin 9 raqam).
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, className, onFocus, onBlur, ...props }, ref) => {
    const display = value ? formatUzPhoneInput(value) : '';

    return (
      <Input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder={UZ_PHONE_PLACEHOLDER}
        className={cn(className)}
        value={display}
        onFocus={(e) => {
          if (!digitsOnly(value)) {
            onChange?.(formatUzPhoneInput('998'));
          }
          onFocus?.(e);
        }}
        onChange={(e) => {
          const rawDigits = digitsOnly(e.target.value);
          // Hammasini o‘chirganda maydonni bo‘sh qoldirish
          if (rawDigits.length === 0) {
            onChange?.('');
            return;
          }
          onChange?.(formatUzPhoneInput(e.target.value));
        }}
        onBlur={(e) => {
          const d = digitsOnly(e.target.value);
          if (!d || d === '998') onChange?.('');
          onBlur?.(e);
        }}
        maxLength={17}
        {...props}
      />
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
