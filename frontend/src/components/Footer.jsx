'use client';

import React from 'react';

const Footer = () => {
  return (
    <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
      <p>This is a demo interface sending mock data for testing purposes</p>
      <p className="mt-2">
        Configure your backend URL by setting{' '}
        <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
          NEXT_PUBLIC_API_URL
        </code>{' '}
        environment variable
      </p>
    </footer>
  );
};

export default Footer;