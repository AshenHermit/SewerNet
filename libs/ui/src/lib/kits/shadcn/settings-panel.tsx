import type { SettingsPanelProps } from '../../ui-kit';
import { ShadcnAdaptiveSlot } from './adaptive-slot';
import { ShadcnSettingsDialog } from './settings-dialog';
import { ShadcnSettingsScreen } from './settings-screen';

/**
 * Adapts the settings presentation to the layout mode.
 *
 * Compact: the panel occupies the shell's `settings` slot. Wide: a modal
 * dialog, mounted only while `open`. `AdaptiveSlot` keeps exactly one form
 * mounted, and all values stay controlled from above, so crossing the
 * breakpoint never touches the theme or locale.
 */
export function ShadcnSettingsPanel(props: SettingsPanelProps) {
  return (
    <ShadcnAdaptiveSlot
      fallback={<ShadcnSettingsScreen {...props} />}
      compact={<ShadcnSettingsScreen {...props} />}
      wide={props.open ? <ShadcnSettingsDialog {...props} /> : null}
    />
  );
}
