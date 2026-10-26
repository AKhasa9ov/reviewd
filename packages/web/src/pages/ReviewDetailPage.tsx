import type { ApiClient } from '@dsh-code-review/ui';
import { ReviewDetail } from '@dsh-code-review/ui';
import { navigate, useLocation } from '../router.js';

export interface ReviewDetailPageProps {
  client: ApiClient;
  id: string;
}

export function ReviewDetailPage({ client, id }: ReviewDetailPageProps): JSX.Element {
  const location = useLocation();
  return <ReviewDetail client={client} id={id} location={location} navigate={navigate} />;
}
