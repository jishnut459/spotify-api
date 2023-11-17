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
    origin: ['http://localhost:4200'],
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
        res.redirect('/api/recommended');

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

app.get('/api/recommended', async (req, res) => {
    try {
        const access_token = req.cookies.access_token;

        if (!access_token) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Get the user's top tracks and top artists to use as seeds for recommendations
        const [topTracksResponse, topArtistsResponse] = await Promise.all([
            axios.get('https://api.spotify.com/v1/me/top/tracks', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            }),
            axios.get('https://api.spotify.com/v1/me/top/artists', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                },
            }),
        ]);

        // Extract track and artist IDs from the top tracks and top artists
        const seedTracks = topTracksResponse.data.items.map(track => track.id).slice(0, 3); // You can adjust the number of seed tracks
        const seedArtists = topArtistsResponse.data.items.map(artist => artist.id).slice(0, 2); // You can adjust the number of seed artists

        // Make a request to the recommendations endpoint with additional parameters
        const recommendationsResponse = await axios.get('https://api.spotify.com/v1/recommendations', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
            params: {
                seed_tracks: seedTracks.join(','), // Pass the seed tracks as a comma-separated string
                seed_artists: seedArtists.join(','), // Pass the seed artists as a comma-separated string
                min_popularity: 50, // Adjust the minimum popularity of the recommended songs
                target_energy: 0.7, // Adjust the target energy of the recommended songs
                // Add more parameters as needed based on the documentation
            },
        });

        // Extract the recommended track IDs
        const recommendedTrackIds = recommendationsResponse.data.tracks.map(track => track.id);

        // Create a new playlist
        const createPlaylistResponse = await axios.post(
            `https://api.spotify.com/v1/me/playlists`,
            {
                name: 'Recommended Playlist', // You can customize the playlist name
                public: false, // You can make the playlist public or private
            },
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const playlistId = createPlaylistResponse.data.id;

        // Add recommended tracks to the playlist
        await axios.post(
            `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            {
                uris: recommendedTrackIds.map(id => `spotify:track:${id}`),
            },
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.status(200).json({ message: 'Recommended songs added to the playlist successfully!' });
    } catch (error) {
        console.error('Error in /api/recommended:', error);
        res.status(500).json({ error: 'Error creating playlist and adding recommended songs' });
    }
});











