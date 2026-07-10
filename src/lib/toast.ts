export type ToastKind = 'success' | 'error' | 'warn';

const KIND_COLOR: Record<ToastKind, string> = {
  success: '#10B981',
  error: '#DC2626',
  warn: '#F59E0B',
};

export function showToast(msg: string, kind: ToastKind = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';

  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${KIND_COLOR[kind]};flex-shrink:0;`;
  el.appendChild(dot);
  el.appendChild(document.createTextNode(msg));

  const root = document.getElementById('toastRoot');
  if (!root) return;
  root.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity .3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}
