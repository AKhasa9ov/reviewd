import { useMemo, useRef } from 'react';
import type { ApiClient } from '@sir_yami/reviewd-ui';
import {
  PortalContainerProvider,
  ThemeProvider,
  ToastProvider,
  createApiClient,
} from '@sir_yami/reviewd-ui';
import { SettingsPage } from '../../../web/src/pages/SettingsPage.js';
import { ErrorBoundary } from './ErrorBoundary.js';

export interface SettingsTabProps {
  client?: ApiClient;
}

function readHostTheme(): 'light' | 'dark' {
  return document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light';
}

export function SettingsTab({ client }: SettingsTabProps): JSX.Element {
  const scopeRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const activeClient = useMemo(
    () => client ?? createApiClient({ baseUrl: '/api/code-review' }),
    [client],
  );

  return (
    <div ref={scopeRef} className="cr-native-scope cr-settings-tab" data-theme={readHostTheme()}>
      <ErrorBoundary title="Could not load repository settings">
        <ThemeProvider initialTheme={readHostTheme()} persist={false} targetRef={scopeRef}>
          <ToastProvider>
            <PortalContainerProvider container={portalRef}>
              <SettingsPage client={activeClient} />
            </PortalContainerProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
      <div ref={portalRef} />
    </div>
  );
}
