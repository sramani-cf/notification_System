import { NOTIFICATION_TYPE_COLORS } from '@/constants';

/**
 * Get the color style for a notification type.
 * @param {string} type - The notification type key.
 * @returns {string} Tailwind CSS classes for styling.
 */
export const getNotificationTypeColor = (type) => {
  if (!type) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300';
  }
  return NOTIFICATION_TYPE_COLORS[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300';
};

/**
 * Format a notification type into a readable string.
 * Example: "FRIEND_REQUEST" → "FRIEND REQUEST"
 * Example: "newMessage" → "NEW MESSAGE"
 * @param {string} type - The notification type key.
 * @returns {string} Formatted notification type.
 */
export const formatNotificationType = (type) => {
  if (!type || typeof type !== 'string') {
    return 'UNKNOWN'; // fallback instead of crashing
  }
  return type
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .toUpperCase();
};

/**
 * Format a timestamp into a readable time string.
 * @param {string|Date} date - Date object or string.
 * @returns {string} Formatted time.
 */
export const formatTimestamp = (date) => {
  if (!date) return '';
  try {
    return new Date(date).toLocaleTimeString();
  } catch {
    return '';
  }
};

/**
 * Format currency values.
 * @param {number} amount - The amount to format.
 * @param {string} currency - Currency code (default: USD).
 * @returns {string} Formatted currency string.
 */
export const formatCurrency = (amount, currency = 'USD') => {
  if (typeof amount !== 'number') return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return amount.toString();
  }
};
