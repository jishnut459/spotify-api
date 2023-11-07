const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:4200', 'https://spotify-dashbaoard.onrender.com'], // Replace with your Angular app's domain
    credentials: true, // Enable cookies and credentials
}));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Helper function to generate a random string for state
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Spotify login route with async/await and error handling
app.get('/login', async (req, res) => {
    try {
        const state = generateRandomString(16);
        const scope = 'user-read-private user-read-email user-top-read playlist-modify-public playlist-modify-private';

        const authorizeUrl = 'https://accounts.spotify.com/authorize?' + querystring.stringify({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state,
        });

        res.redirect(authorizeUrl);
    } catch (error) {
        console.error('Error in /login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Callback route to handle the response from Spotify
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (!code || !state) {
        res.status(400).json({ error: 'Missing code or state parameters' });
        return;
    }

    try {
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
            },
        };

        const response = await axios.post(authOptions.url, querystring.stringify(authOptions.form), {
            headers: authOptions.headers,
        });

        // Store the access token in a cookie for later use
        res.cookie('access_token', response.data.access_token, { httpOnly: true });
        // Redirect to the Angular app's dashboard
        res.redirect('https://spotify-dashbaoard.onrender.com');

    } catch (error) {
        console.error('Error in /callback:', error);
        res.status(500).json({ error: 'Error exchanging code for access token' });
    }
});

// Define the User Details API endpoint
app.get('/api/user', async (req, res) => {
    try {
        // Retrieve the access token from the cookie
        const access_token = req.cookies.access_token;

        if (!access_token) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Make an authorized request to Spotify's API to get user details
        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        res.status(200).json(response.data);

    } catch (error) {
        console.error('Error in /api/user:', error);
        res.status(500).json({ error: 'Error fetching user details' });
    }
});

app.get('/api/top-tracks', async (req, res) => {
    try {
        const access_token = req.cookies.access_token;

        if (!access_token) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error in /api/top-tracks:', error);
        res.status(500).json({ error: 'Error fetching top tracks' });
    }
});

app.get('/api/top-artists', async (req, res) => {
    try {
        const access_token = req.cookies.access_token;

        if (!access_token) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const response = await axios.get('https://api.spotify.com/v1/me/top/artists', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error in /api/top-artists:', error);
        res.status(500).json({ error: 'Error fetching top artists' });
    }
});




