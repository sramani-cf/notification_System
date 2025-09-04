// Test script to verify NotificationToast functionality
const axios = require('axios');

const FRONTEND_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:8000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNotificationToast() {
    console.log('🔔 Notification Toast Verification Script');
    console.log('========================================\n');
    
    const testUserId = 'test-user-' + Math.random().toString(36).substr(2, 9);
    
    try {
        // Step 1: Create test user session
        console.log('1️⃣ Creating test user session...');
        const authResponse = await axios.post(`${FRONTEND_URL}/api/auth/test-user`, {
            userId: testUserId,
            username: 'Test User'
        });
        
        if (authResponse.status === 200) {
            console.log('✅ Test user created successfully');
            console.log(`   User ID: ${authResponse.data.userId}`);
        }
        
        await sleep(1000);
        
        // Step 2: Test single notification
        console.log('\n2️⃣ Testing single notification display...');
        const singleNotif = await axios.post(`${FRONTEND_URL}/api/notifications/send`, {
            userId: testUserId,
            type: 'test',
            title: 'Single Test Notification',
            message: 'This notification should display as a toast',
            priority: 'normal'
        });
        
        if (singleNotif.status === 200) {
            console.log('✅ Single notification sent successfully');
        }
        
        await sleep(2000);
        
        // Step 3: Test multiple notifications with same content
        console.log('\n3️⃣ Testing duplicate notifications (should show each time)...');
        for (let i = 1; i <= 3; i++) {
            const dupNotif = await axios.post(`${FRONTEND_URL}/api/notifications/send`, {
                userId: testUserId,
                type: 'test',
                title: 'Duplicate Test',
                message: 'This exact same notification is sent 3 times',
                priority: 'normal'
            });
            
            if (dupNotif.status === 200) {
                console.log(`✅ Duplicate notification ${i}/3 sent`);
            }
            await sleep(500);
        }
        
        await sleep(2000);
        
        // Step 4: Test different priority notifications
        console.log('\n4️⃣ Testing different priority notifications...');
        const priorities = ['low', 'normal', 'high', 'urgent'];
        
        for (const priority of priorities) {
            const prioNotif = await axios.post(`${FRONTEND_URL}/api/notifications/send`, {
                userId: testUserId,
                type: 'test',
                title: `${priority.toUpperCase()} Priority`,
                message: `This is a ${priority} priority notification`,
                priority: priority
            });
            
            if (prioNotif.status === 200) {
                console.log(`✅ ${priority} priority notification sent`);
            }
            await sleep(1000);
        }
        
        // Step 5: Test rapid-fire notifications
        console.log('\n5️⃣ Testing rapid-fire notifications...');
        const rapidPromises = [];
        for (let i = 1; i <= 5; i++) {
            rapidPromises.push(
                axios.post(`${FRONTEND_URL}/api/notifications/send`, {
                    userId: testUserId,
                    type: 'test',
                    title: `Rapid Notification ${i}`,
                    message: `Rapid-fire test notification number ${i}`,
                    priority: 'normal'
                })
            );
        }
        
        const rapidResults = await Promise.all(rapidPromises);
        const successCount = rapidResults.filter(r => r.status === 200).length;
        console.log(`✅ ${successCount}/5 rapid notifications sent successfully`);
        
        await sleep(3000);
        
        // Step 6: Test notification types
        console.log('\n6️⃣ Testing different notification types...');
        const types = ['login', 'signup', 'reset_password', 'purchase'];
        
        for (const type of types) {
            const typeNotif = await axios.post(`${FRONTEND_URL}/api/notifications/send`, {
                userId: testUserId,
                type: type,
                title: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
                message: `Test ${type} notification with appropriate icon`,
                priority: 'normal'
            });
            
            if (typeNotif.status === 200) {
                console.log(`✅ ${type} notification sent`);
            }
            await sleep(1000);
        }
        
        console.log('\n========================================');
        console.log('✅ All notification toast tests completed!');
        console.log('\n📋 Summary of tests performed:');
        console.log('  • Single notification display');
        console.log('  • Duplicate notifications (same content)');
        console.log('  • Different priority levels');
        console.log('  • Rapid-fire notifications');
        console.log('  • Different notification types');
        console.log('\n🎯 Expected behavior:');
        console.log('  • Each notification should appear as a toast');
        console.log('  • Toasts should slide in from the right');
        console.log('  • Auto-dismiss after 5 seconds (except urgent)');
        console.log('  • Multiple toasts should stack properly');
        console.log('  • Duplicate content should still display');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testNotificationToast();