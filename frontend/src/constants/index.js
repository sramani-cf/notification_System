export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const NOTIFICATION_TYPES = {
  SIGNUP: 'signup',
  LOGIN: 'login',
  RESET_PASSWORD: 'reset_password',
  PURCHASE: 'purchase',
  FRIEND_REQUEST: 'friend_request'
};

export const NOTIFICATION_BUTTONS = [
  {
    type: 'signup',
    label: 'New Signup',
    subtitle: 'User Registration',
    gradient: 'from-green-500 to-green-600 hover:from-green-600 hover:to-green-700',
    icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z'
  },
  {
    type: 'login',
    label: 'User Login',
    subtitle: 'Authentication',
    gradient: 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700',
    icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1'
  },
  {
    type: 'reset_password',
    label: 'Reset Password',
    subtitle: 'Password Recovery',
    gradient: 'from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600',
    icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z'
  },
  {
    type: 'purchase',
    label: 'New Purchase',
    subtitle: 'Transaction',
    gradient: 'from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z'
  },
  {
    type: 'friendRequest',
    label: 'Friend Request',
    subtitle: 'Social',
    gradient: 'from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
  }
];

export const NOTIFICATION_TYPE_COLORS = {
  signup: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  login: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  resetPassword: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  reset_password: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  purchase: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  friendRequest: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  friend_request: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
};

export const MAX_NOTIFICATION_HISTORY = 10;