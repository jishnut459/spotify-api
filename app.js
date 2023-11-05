const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const uuid = require('uuid');
const cors = require('cors');


const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;



app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:4200'], // Replace with your Angular app's domain
    credentials: true, // Enable cookies and credentials
}));

  

const accessTokens = {};

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

app.get('/login', (req, res) => {
    try {
        const scope = 'user-top-read';
        const authorizationUrl = `https://accounts.spotify.com/authorize?${querystring.stringify({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope,
            redirect_uri: REDIRECT_URI,
        })}`;

        res.redirect(authorizationUrl);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error occurred while initiating Spotify authentication.');
    }
});


app.get('/callback', async (req, res) => {
    const code = req.query.code;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            code,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }), {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        // Generate a unique session ID using uuid
        const sessionId = uuid.v4();

        // Store access token in the accessTokens object with the session ID
        const accessToken = response.data.access_token;
        accessTokens[sessionId] = accessToken;

        // Set the session ID as a secure cookie
        res.cookie('sessionId', sessionId, { httpOnly: true, secure: true, domain: 'localhost'});

        // Create a playlist after receiving the access token
        await createPlaylist(accessToken);
        // Redirect the user to the Angular app
        // res.redirect('/top-songs');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error occurred while authenticating with Spotify.');
        
    }
});
app.get('/get-access-token', (req, res) => {
    const sessionId = req.cookies.sessionId;

    // Check if the session ID exists in the accessTokens object
    if (accessTokens[sessionId]) {
        res.json({ access_token: accessTokens[sessionId] });
    } else {
        res.status(404).json({ error: 'Access token not found for this session' });
    }
});

app.get('/top-songs', async (req, res) => {
    const sessionId = req.cookies.sessionId; // Retrieve the session ID from the secure cookie

    // Check if the session ID exists in the accessTokens object
    if (accessTokens[sessionId]) {
        const accessToken = accessTokens[sessionId];

        try {
            const response = await axios.get('https://api.spotify.com/v1/me/top/tracks', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
                params: {
                    limit: 10, // You can change the limit to fetch more top songs
                },
            });

            const topSongs = response.data.items;

            // Create a new playlist with the user's top songs
            const playlistResponse = await axios.post('https://api.spotify.com/v1/me/playlists', {
                name: 'My Top Songs', // Set the playlist name
                public: false, // Set the playlist as private
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const playlistId = playlistResponse.data.id;

            // Add the top songs to the newly created playlist
            const uris = topSongs.map((song) => song.uri);
            await axios.post(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                uris,
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            // Send the list of top songs as the response
            res.json({ topSongs, playlistId });

        } catch (error) {
            console.error(error);
            res.status(500).send('Error creating and adding top songs to the playlist.');
        }
    } else {
        // If the session ID is not found, redirect the user to the authentication route
        res.redirect('/login'); // Replace with the actual authentication route
    }
});




