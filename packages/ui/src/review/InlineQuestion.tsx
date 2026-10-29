import type { ReviewQuestion } from '@dsh-code-review/core';
import { Badge } from '../primitives/Feedback.js';

export interface InlineQuestionProps {
  question: ReviewQuestion;
}

export function InlineQuestion({ question }: InlineQuestionProps): JSX.Element {
  return (
    <article
      className="cr-inline-question"
      role="cell"
      aria-label={`question: ${question.question}`}
    >
      <span className="cr-inline-question-mark" aria-hidden="true">
        ?
      </span>
      <div className="cr-inline-question-main">
        <header className="cr-inline-question-head">
          <Badge tone="info">question</Badge>
          <span className="cr-meta">line {question.line}</span>
        </header>
        <p className="cr-inline-question-text">{question.question}</p>
        <p className="cr-inline-question-why">
          <span className="cr-meta">Why:</span> {question.why}
        </p>
      </div>
    </article>
  );
}
