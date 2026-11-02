import type { ApiClient } from '@sir_yami/reviewd-ui';
import { ReviewDetail } from '@sir_yami/reviewd-ui';
import { navigate, useLocation } from '../router.js';

export interface ReviewDetailPageProps {
  client: ApiClient;
  id: string;
}

export function ReviewDetailPage({ client, id }: ReviewDetailPageProps): JSX.Element {
  const location = useLocation();
  return <ReviewDetail client={client} id={id} location={location} navigate={navigate} />;
}
