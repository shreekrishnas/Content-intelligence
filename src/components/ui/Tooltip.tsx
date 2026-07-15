import { useState, useRef, type ReactNode } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useInteractions,
  FloatingPortal,
  arrow,
} from '@floating-ui/react';
import { AnimatePresence, motion } from 'motion/react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  placement?: 'right' | 'top' | 'bottom' | 'left';
}

export default function Tooltip({ content, children, placement = 'right' }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef(null);

  const { refs, floatingStyles, context, middlewareData } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 6 }),
      arrow({ element: arrowRef }),
    ],
  });

  const hover = useHover(context, { delay: { open: 300, close: 80 } });
  const focus = useFocus(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus]);

  const arrowX = middlewareData.arrow?.x;
  const arrowY = middlewareData.arrow?.y;

  return (
    <>
      <div ref={refs.setReference} {...getReferenceProps()} style={{ display: 'contents' }}>
        {children}
      </div>
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={refs.setFloating}
              {...getFloatingProps()}
              initial={{ opacity: 0, scale: 0.92, x: placement === 'right' ? -4 : 0 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{ ...floatingStyles, zIndex: 9999 }}
            >
              <div
                style={{
                  background: '#1E1B4B',
                  color: '#fff',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.24)',
                  pointerEvents: 'none',
                }}
              >
                {content}
                <div
                  ref={arrowRef}
                  style={{
                    position: 'absolute',
                    left: arrowX != null ? `${arrowX}px` : '',
                    top: arrowY != null ? `${arrowY}px` : '',
                    ...(placement === 'right' && { left: '-4px', top: '50%', transform: 'translateY(-50%)' }),
                    width: 8,
                    height: 8,
                    background: '#1E1B4B',
                    transform: 'rotate(45deg)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
