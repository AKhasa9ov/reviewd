import { PageHeader } from '../components.js';
import { BackLink } from '../components.js';

export interface ReviewDetailPlaceholderProps {
  id: string;
}

export function ReviewDetailPlaceholder({ id }: ReviewDetailPlaceholderProps): JSX.Element {
  return (
    <div className="cr-placeholder">
      <BackLink to="/" label="All reviews" />
      <div style={{ height: 16 }} />
      <PageHeader
        eyebrow="Review workspace"
        title="Review detail"
        description="The diff, conversation, fix-status board and reviewer report arrive in the next UI task."
      />
      <div className="cr-form-card">
        <p className="cr-meta" style={{ margin: 0 }}>
          Review id
        </p>
        <p className="cr-mono" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {id}
        </p>
      </div>
    </div>
  );
}
