// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  useToast,
} from '../src/index.js';

describe('Button and IconButton', () => {
  it('activates from the keyboard and reports loading/disabled state', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} icon={<span aria-hidden="true">+</span>}>
        Create review
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Create review' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();

    const { rerender } = render(<Button loading>Working</Button>);
    expect(screen.getByRole('button', { name: 'Working' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working' })).toHaveAttribute('aria-busy', 'true');
    rerender(<Button disabled>Working</Button>);
    expect(screen.getByRole('button', { name: 'Working' })).toBeDisabled();
  });

  it('requires an accessible name for icon buttons', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="Open navigation" onClick={onClick}>
        <span aria-hidden="true">≡</span>
      </IconButton>,
    );
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('fields', () => {
  it('associates labels, hints and errors', () => {
    render(
      <Input
        label="Repository path"
        hint="Resolved on the daemon"
        error="Repository is required"
        value=""
        onChange={() => undefined}
        readOnly
      />,
    );
    const input = screen.getByLabelText('Repository path');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Resolved on the daemon.*Repository is required/);
    expect(screen.getByRole('alert')).toHaveTextContent('Repository is required');
  });

  it('supports textarea and select primitives', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Textarea label="Summary" defaultValue="Looks good" />
        <Select
          label="Filter by status"
          defaultValue="open"
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </>,
    );
    expect(screen.getByLabelText('Summary')).toHaveValue('Looks good');
    const select = screen.getByLabelText('Filter by status');
    await user.selectOptions(select, 'closed');
    expect(select).toHaveValue('closed');
  });
});

describe('Dialog', () => {
  function Harness(): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open dialog
        </button>
        <Dialog
          open={open}
          title="Submit review"
          description="The feedback is sent to the initiating session."
          onClose={() => setOpen(false)}
          actions={
            <button type="button" onClick={() => setOpen(false)}>
              Send
            </button>
          }
        >
          <p>Choose a verdict.</p>
        </Dialog>
      </>
    );
  }

  it('traps Tab, closes with Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Submit review' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Send' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on a backdrop click but not on a click inside', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="Confirm" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    );
    await user.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(document.querySelector('.cr-overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('can disable close controls while a task is pending', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open title="Saving" onClose={onClose} closeDisabled>
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.cr-overlay') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  function Harness(): JSX.Element {
    const [value, setValue] = useState('conversation');
    return (
      <Tabs
        label="Review sections"
        value={value}
        onChange={setValue}
        items={[
          { id: 'conversation', label: 'Conversation', content: 'Thread content' },
          { id: 'files', label: 'Files changed', content: 'Diff content' },
          { id: 'report', label: 'Report', content: 'Report content' },
        ]}
      />
    );
  }

  it('moves with arrow keys and exposes aria-selected', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Conversation' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Files changed' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Diff content');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Thread content');
  });
});

describe('Toast and Tooltip', () => {
  function ToastHarness(): JSX.Element {
    const { toast } = useToast();
    return (
      <button type="button" onClick={() => toast('Review created')}>
        Notify
      </button>
    );
  }

  it('announces toasts in a live region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Notify' }));
    expect(screen.getByRole('status')).toHaveTextContent('Review created');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Review created')).not.toBeInTheDocument();
  });

  it('describes its trigger on focus', async () => {
    render(
      <Tooltip label="Switch to light theme">
        <button type="button">Theme</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Theme' });
    fireEvent.focus(trigger);
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveAttribute('data-open', 'true'));
    expect(trigger).toHaveAccessibleDescription('Switch to light theme');
  });
});

describe('display primitives', () => {
  it('renders badges, skeletons and empty states', () => {
    render(
      <>
        <Badge tone="success">open</Badge>
        <Skeleton width={120} height={12} />
        <EmptyState title="No reviews yet" description="Create one." />
      </>,
    );
    expect(screen.getByText('open')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.getByText('Create one.')).toBeInTheDocument();
    expect(document.querySelector('.cr-skeleton')).toHaveAttribute('aria-hidden', 'true');
  });
});
