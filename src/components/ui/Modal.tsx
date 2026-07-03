import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab' && dialogRef.current) {
        // Trap focus inside the dialog.
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute('aria-hidden'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    previousFocus.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handler);
    // Focus the first interactive element inside the dialog (or the dialog itself).
    requestAnimationFrame(() => {
      const targets = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (targets && targets.length > 0) targets[0].focus();
      else dialogRef.current?.focus();
    });
    return () => {
      document.removeEventListener('keydown', handler);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          'relative card max-h-[90vh] overflow-y-auto w-full focus:outline-none',
          size === 'sm' && 'max-w-md',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-3xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || true) && (
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 id={titleId}>{title}</h3>
            <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}
