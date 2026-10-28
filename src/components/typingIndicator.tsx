/** CSS-only motion keeps loading feedback independent of audio and frame updates. */
export function TypingIndicator() {
  return (
    <div role="status" aria-label="AI is responding" className="pointer-events-none absolute inset-0 flex items-center justify-center text-gray-600">
      <span className="sr-only">AI is responding</span>
      <span aria-hidden="true" className="flex h-2 items-center gap-1.5">
        {[0, 1, 2].map(dot => <span key={dot} className="chat-loading-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${dot * 140}ms` }} />)}
      </span>
    </div>
  );
}
