import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUi } from '../../store/uiStore';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { Dialog } from '../ui/Dialog';
import { FieldRow, Input } from '../ui/Field';

export function ConfirmDialog() {
  const req = useUi((s) => s.confirm);
  const close = () => useUi.getState().askConfirm(null);
  return (
    <Dialog
      open={!!req}
      onClose={close}
      title={req?.title}
      size="sm"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant={req?.danger ? 'danger' : 'primary'}
            data-primary
            onClick={() => {
              req?.onConfirm();
              close();
            }}
          >
            {req?.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">{req?.message}</p>
    </Dialog>
  );
}

export function PromptDialog() {
  const req = useUi((s) => s.prompt);
  const [value, setValue] = useState('');
  useEffect(() => {
    if (req) setValue(req.initial);
  }, [req]);
  const close = () => useUi.getState().askPrompt(null);
  const submit = () => {
    if (!value.trim() || !req) return;
    req.onSubmit(value.trim());
    close();
  };
  return (
    <Dialog
      open={!!req}
      onClose={close}
      title={req?.title}
      size="sm"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {req?.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <FieldRow label={req?.label} htmlFor="prompt-input">
          <Input id="prompt-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </FieldRow>
      </form>
    </Dialog>
  );
}

const TONE = {
  info: { icon: <Info size={15} />, cls: 'text-primary' },
  success: { icon: <CircleCheck size={15} />, cls: 'text-success' },
  error: { icon: <CircleAlert size={15} />, cls: 'text-danger' },
};

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  return createPortal(
    <div className="pointer-events-none fixed bottom-12 left-1/2 z-[1100] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex animate-fade-in items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] text-fg shadow-xl">
          <span className={cn(TONE[t.tone].cls)}>{TONE[t.tone].icon}</span>
          {t.message}
          <button type="button" aria-label="Dismiss" onClick={() => useUi.getState().dismissToast(t.id)} className="ml-1 text-subtle hover:text-fg">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
