import { NOTIFICATION_TYPE_COLORS } from '@/constants';

export const getNotificationTypeColor = (type) => {
  return NOTIFICATION_TYPE_COLORS[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300';
};

export const formatNotificationType = (type) => {
  return type.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase();
};

export const formatTimestamp = (date) => {
  return new Date(date).toLocaleTimeString();
};

export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};