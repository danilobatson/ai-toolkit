'use client';

import { Tab, Tabs } from 'fumadocs-ui/components/tabs';

interface InstallTabsProps {
  packages: string[];
}

function toCommand(pm: string, pkgs: string[]): string {
  const joined = pkgs.join(' ');
  switch (pm) {
    case 'yarn':
      return `yarn add ${joined}`;
    case 'pnpm':
      return `pnpm add ${joined}`;
    default:
      return `npm install ${joined}`;
  }
}

export function InstallTabs({ packages: pkgs }: InstallTabsProps) {
  return (
    <Tabs items={['npm', 'yarn', 'pnpm']} defaultIndex={1}>
      {['npm', 'yarn', 'pnpm'].map((pm) => (
        <Tab key={pm} value={pm}>
          <pre className="!mt-0">
            <code>{toCommand(pm, pkgs)}</code>
          </pre>
        </Tab>
      ))}
    </Tabs>
  );
}
