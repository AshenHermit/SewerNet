import type { SettingsPanelProps } from '../ui-kit';
import { useUiKit } from './ui-kit-provider';

export type ProxySettingsPanelProps = SettingsPanelProps;

/** Renders the settings panel of the currently selected UI kit. */
export function ProxySettingsPanel(props: SettingsPanelProps) {
  const kit = useUiKit();
  return <kit.SettingsPanel {...props} />;
}

