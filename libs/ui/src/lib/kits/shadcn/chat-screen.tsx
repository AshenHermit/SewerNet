import { cn } from '@sewer-net/utils';
import type { ChatScreenProps, ChatSection } from '../../ui-kit';

/** Panel ids in render order; the DOM order never changes between modes. */
const PANELS = ['rooms', 'chat', 'settings'] as const;

function panelHidden(panel: ChatSection, section: ChatSection): boolean {
  // Only the effective section is visible; the other two wrappers stay mounted.
  return panel !== section;
}

/**
 * Chat screen shell with named slots.
 *
 * Every slot is mounted for the whole life of the screen: switching sections
 * flips the `hidden` attribute on the panel wrappers instead of unmounting, so
 * drafts, the search query, scroll position and Matrix subscriptions survive.
 * `section` is already the effective section (app-side fallback), so the shell
 * never mutates navigation state on a resize.
 */
export function ShadcnChatScreen({
  ref,
  section,
  activeRoomId,
  rail,
  rooms,
  chat,
  settings,
  bottomNavigation,
  className,
  ...props
}: ChatScreenProps) {
  // Compact-only navigation: on wide the rail owns both destinations, and the
  // chat section hides the bar on compact so the conversation gets the height.
  // The slot lives in the horizontal row so the bar can stretch, and only its
  // own `hidden` attribute decides visibility.
  const navVisible = bottomNavigation !== null && section !== 'chat';

  return (
    <div
      {...props}
      ref={ref}
      data-sn-section={section}
      data-sn-room={activeRoomId ?? undefined}
      className={cn(
        'flex h-full min-h-0 min-w-0 overflow-hidden bg-[var(--sn-bg)]',
        className,
      )}
    >
      {rail !== null ? (
        <div data-sn-nav="rail" className="hidden shrink-0 sn-wide:flex">
          {rail}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1">
          {PANELS.map((panel) => (
            <div
              key={panel}
              data-sn-panel={panel}
              hidden={panelHidden(panel, section)}
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col',
                panel === 'rooms' && 'sn-wide:max-w-[var(--sn-room-list-width)]',
              )}
            >
              {panel === 'rooms' ? rooms : panel === 'chat' ? chat : settings}
            </div>
          ))}

          {/* Owns the compact navigation slot, so no padding reaches the widget. */}
          <div
            data-sn-nav="bottom"
            hidden={bottomNavigation === null || !navVisible}
            className="shrink-0 sn-wide:hidden"
          >
            {bottomNavigation}
          </div>
        </div>
      </div>
    </div>
  );
}
