import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { HandRaisedIcon, XMarkIcon, PlayIcon } from '@heroicons/react/24/outline';
import { ViewerContext } from '@/features/vrmViewer/viewerContext';
import { GestureScheduler, GestureSnapshot } from '@/features/avatarMotion/gestureScheduler';
import { defaultGestureSelection } from '@/features/avatarMotion/gestureCatalog';
import { updateConfig } from '@/utils/config';

const empty: GestureSnapshot = { enabled: false, selected: [], activeId: null, source: null, phase: 'idle', error: '' };
const noSubscription = () => () => {};
const emptySnapshot = () => empty;
const categories = [
  ['combined', 'Body + face / 組合動作'], ['body', 'Presenter gestures / 主持動作'],
  ['face', 'Facial actions / 表情'], ['fullBody', 'Local motion pack · full body / 全身動作'],
] as const;

export function GestureControls({ large = false }: { large?: boolean }) {
  const { viewer } = useContext(ViewerContext);
  const [open, setOpen] = useState(false);
  const [scheduler, setScheduler] = useState<GestureScheduler>();
  // Models can be swapped from the existing settings panel. Subscribe only to
  // action/state changes; React never follows the avatar's per-frame updates.
  useEffect(() => {
    const connect = () => setScheduler(current => current === viewer.model?.gestures ? current : viewer.model?.gestures);
    connect(); const timer = window.setInterval(connect, 250);
    return () => window.clearInterval(timer);
  }, [viewer]);
  const state = useSyncExternalStore(scheduler?.subscribe ?? noSubscription, scheduler?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const configure = (enabled: boolean, selected: string[]) => {
    scheduler?.configure(enabled, selected);
    void updateConfig('random_gestures_enabled', String(enabled));
    void updateConfig('random_gestures_selected', JSON.stringify(selected));
  };
  const current = scheduler?.actions.find(action => action.id === state.activeId);
  const preview = (id: string) => {
    scheduler?.preview(id);
    if (window.innerWidth < 1024) setOpen(false);
  };
  const status = state.error || (current ? state.phase === 'waiting' ? `Queued until the avatar is free: ${current.label}` : state.phase === 'loading' ? `Loading: ${current.label}` : state.phase === 'returning' ? 'Returning to presenter stance…' : `Playing: ${current.label}` : state.enabled ? state.selected.length ? 'Random actions on · pauses during speech' : 'Choose an action for random playback.' : 'Random actions off · previews available');

  return <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Gestures / 動作" title="Gestures / 動作" aria-haspopup="dialog" aria-expanded={open}
        className={`flex shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-400 ${large ? 'h-16 w-16' : 'h-11 w-11'}`}>
        <HandRaisedIcon className={large ? 'h-14 w-14' : 'h-7 w-7'} aria-hidden="true" />
      </button>
    <Dialog open={open} onClose={() => setOpen(false)} className="relative z-30">
      <div className="fixed inset-0 bg-black/15" aria-hidden="true" />
      <DialogPanel className="fixed bottom-24 right-3 top-4 flex w-[390px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl bg-slate-50 text-slate-900 shadow-2xl ring-1 ring-black/10">
        <div className="bg-slate-900 px-5 pb-4 pt-5 text-white">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg font-bold">Gestures / 動作</DialogTitle>
            <button type="button" aria-label="Close gestures" onClick={() => setOpen(false)} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-400"><XMarkIcon className="h-5 w-5" /></button>
          </div>
          <p className="mt-1 text-sm text-slate-300">Preview once, or choose occasional random actions.</p>
          <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold">
            Random gestures / 隨機動作
            <input type="checkbox" role="switch" checked={state.enabled} disabled={!scheduler} onChange={event => configure(event.target.checked, state.selected)} className="h-6 w-6 rounded border-slate-400 text-pink-600 focus:ring-pink-400" />
          </label>
          <p role="status" className="mt-3 min-h-10 text-sm leading-5 text-slate-200">{scheduler ? status : 'Loading avatar actions…'}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="flex min-h-12 items-center justify-between gap-2 text-xs">
            <span>{state.selected.length} selected</span>
            <button type="button" disabled={!scheduler} onClick={() => configure(state.enabled, [])} className="min-h-11 px-2 font-semibold text-slate-700 underline underline-offset-2">Clear selection</button>
          </div>
          {categories.map(([category, title]) => {
            const actions = scheduler?.actions.filter(action => action.category === category) ?? [];
            if (!actions.length) return null;
            return <fieldset key={category} className="mb-5">
              <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{title}</legend>
              {category === 'fullBody' && <p className="mb-2 text-xs leading-5 text-slate-600">These move the whole body. Add each one only if you want it in the random pool.</p>}
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {actions.map(action => <div key={action.id} className="flex min-h-16 items-center gap-1 px-2 py-1">
                  <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 text-sm font-medium">
                    <input type="checkbox" aria-label={`Include ${action.label} in random pool`} checked={state.selected.includes(action.id)} onChange={event => configure(state.enabled, event.target.checked ? [...state.selected, action.id] : state.selected.filter(id => id !== action.id))} className="h-5 w-5 shrink-0 rounded border-slate-400 text-pink-600 focus:ring-pink-500" />
                    <span>{action.label}</span>
                  </label>
                  <button type="button" aria-label={`Preview ${action.label}`} onClick={() => preview(action.id)} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-2 text-xs font-semibold text-slate-800 hover:bg-pink-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-500"><PlayIcon className="h-4 w-4" aria-hidden="true" /> Preview</button>
                </div>)}
              </div>
            </fieldset>;
          })}
          {!state.selected.length && scheduler && <p className="rounded-xl bg-slate-200 p-3 text-sm">No random actions selected. Individual previews still work.</p>}
          <button type="button" disabled={!scheduler} onClick={() => configure(state.enabled, defaultGestureSelection.filter(id => scheduler?.actions.some(action => action.id === id)))} className="min-h-11 py-2 text-sm font-semibold text-slate-700 underline underline-offset-2">Use presenter selection</button>
        </div>
        <div className="border-t border-slate-200 bg-white px-5 py-3 text-xs leading-5 text-slate-600">
          <p>Natural blinking and subtle breathing stay on.</p>
          {scheduler?.actions.some(action => action.clipUrl) && <p className="mt-1">Local pack: Animation credits to pixiv Inc.&apos;s VRoid Project</p>}
        </div>
      </DialogPanel>
    </Dialog>
  </>;
}
