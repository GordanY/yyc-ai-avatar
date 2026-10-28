import * as React from 'react';
import clsx from 'clsx';

export function MenuButton({
  icon,
  onClick,
  large,
  label,
  href,
  target,
  disabled,
}: {
  icon: React.ComponentType<any>,
  onClick?: () => void,
  large: boolean,
  label: string,
  href?: string,
  target?: string,
  disabled?: boolean,
}) {
  const Icon = icon; // Capitalize to use as component

  if (href) {
    onClick = () => {
      window.open(href, target);
    };
  }

  return (
    <div className="flex flex-row items-center space-x-2">
      <button
        type="button"
        aria-label={label}
        title={label}
        className={clsx('flex shrink-0 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-400', large ? 'h-16 w-16' : 'h-11 w-11')}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon
          className={clsx(
            large ? 'h-14 w-14' : 'h-7 w-7',
            'text-white',
            disabled && 'cursor-not-allowed opacity-20',
            !disabled && 'opacity-50 hover:opacity-100 active:opacity-100 hover:cursor-pointer',
         )}
          aria-hidden="true"
        />
        <span className="text-white hidden">{label}</span>
      </button>
    </div>
  );
}
