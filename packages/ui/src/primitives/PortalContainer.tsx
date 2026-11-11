import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface PortalContainerRef {
  readonly current: HTMLElement | null;
}

const PortalContainerContext = createContext<PortalContainerRef | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: PortalContainerRef;
  children: ReactNode;
}): JSX.Element {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext)?.current ?? null;
}
