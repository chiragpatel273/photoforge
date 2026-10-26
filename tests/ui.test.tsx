/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ErrorMessage, Spinner } from '../apps/web/src/components/ui';

test('errors and pending states are accessible to assistive technology', () => {
  render(
    <>
      <ErrorMessage message="Upload failed" />
      <Spinner label="Processing photo" />
    </>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
  expect(screen.getByRole('status')).toHaveTextContent('Processing photo');
});
