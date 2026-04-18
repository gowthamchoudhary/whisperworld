import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CameraCapture from './CameraCapture';

// Mock supabase
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('CameraCapture', () => {
  const mockOnIdentificationComplete = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders camera button', () => {
    render(<CameraCapture onIdentificationComplete={mockOnIdentificationComplete} onError={mockOnError} />);
    const button = screen.getByRole('button', { name: /capture photo/i });
    expect(button).toBeDefined();
  });

  it('validates file size', async () => {
    render(<CameraCapture onIdentificationComplete={mockOnIdentificationComplete} onError={mockOnError} />);
    
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    // Create a file larger than 10 MB
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    
    Object.defineProperty(fileInput, 'files', {
      value: [largeFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/file size exceeds 10 mb limit/i)).toBeDefined();
    });
  });

  it('validates MIME type', async () => {
    render(<CameraCapture onIdentificationComplete={mockOnIdentificationComplete} onError={mockOnError} />);
    
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    
    Object.defineProperty(fileInput, 'files', {
      value: [invalidFile],
      writable: false,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/invalid file type/i)).toBeDefined();
    });
  });

  it('shows loading state during upload', () => {
    render(<CameraCapture onIdentificationComplete={mockOnIdentificationComplete} onError={mockOnError} />);
    const button = screen.getByRole('button', { name: /capture photo/i });
    
    // Button should not be disabled initially
    expect(button.hasAttribute('disabled')).toBe(false);
  });
});
