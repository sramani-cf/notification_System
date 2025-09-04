export const generateMockData = (user = null) => {
  // Use provided user data or generate random values
  const userId = user?.userId || Math.floor(Math.random() * 10000);
  const username = user?.username || `user_${Math.random().toString(36).substring(7)}`;
  const email = user?.email || 'ramanisahil.cf@gmail.com';  //'rutvilathiya60@gmail.com'  , dhruv@dhruv.vip, 
  
  // Generate purchase item data first to calculate totalAmount
  const purchaseQuantity = Math.floor(Math.random() * 3) + 1;
  const purchasePrice = parseFloat((Math.random() * 100 + 10).toFixed(2));
  const purchaseTotalAmount = purchaseQuantity * purchasePrice;

  return {
  signup: {
    type: 'signup',
    userId: userId,
    username: username,
    email: email,
    password: `Pass${Math.random().toString(36).substring(2, 10)}!`,
    timestamp: new Date().toISOString(),
  },
  login: {
    type: 'login',
    userId: userId,
    username: username,
    email: email,
    password: `Pass${Math.random().toString(36).substring(2, 10)}!`,
    ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    device: ['Chrome on Windows', 'Safari on MacOS', 'Mobile App'][Math.floor(Math.random() * 3)],
    timestamp: new Date().toISOString(),
  },
  reset_password: {
    type: 'reset_password',
    userId: userId,
    email: email,
    resetToken: Math.floor(100000 + Math.random() * 900000).toString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    timestamp: new Date().toISOString(),
  },
  purchase: {
    type: 'purchase',
    userId: userId,
    orderId: `ORD-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    amount: purchaseTotalAmount,
    currency: 'USD',
    items: [
      {
        name: ['Premium Subscription', 'Pro License', 'Enterprise Plan'][Math.floor(Math.random() * 3)],
        quantity: purchaseQuantity,
        price: purchasePrice,
      }
    ],
    totalAmount: purchaseTotalAmount,
    timestamp: new Date().toISOString(),
  },
  friendRequest: {
    type: 'friend_request',
    fromUserId: Math.floor(Math.random() * 10000),
    fromUsername: `friend_${Math.random().toString(36).substring(7)}`,
    toUserId: userId,
    toUsername: username,
    message: 'Hey! Let\'s connect!',
    timestamp: new Date().toISOString(),
  },
  };
};