const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const Joi = require('joi');
const config = require('./config.js');

const Movie = require('./models/Movie');
const Genre = require('./models/Genre');
const Review = require('./models/Review');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

const movieValidation = Joi.object({
    title: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().min(5).max(1000).required(),
    genre: Joi.string().required(),
    releaseYear: Joi.number().integer().min(1900).max(2100).required(),
    rating: Joi.number().min(0).max(10).required()
});

const reviewValidation = Joi.object({
    username: Joi.string().trim().min(2).max(50).required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().trim().min(2).max(500).required()
});

app.get('/', async (req, res) => {
    const movies = await Movie.find().populate('genre').sort({ createdAt: -1 });
    res.render('index', { movies });
});

app.get('/movies', async (req, res) => {
    const search = (req.query.search || '').trim();
    const filter = search ? { title: { $regex: search, $options: 'i' } } : {};
    const movies = await Movie.find(filter).populate('genre').sort({ createdAt: -1 });
    res.render('movies', { movies, search });
});

app.get('/movies/new', async (req, res) => {
    const genres = await Genre.find().sort({ name: 1 });
    res.render('add-movie', { genres, error: null });
});

app.post('/movies', upload.single('image'), async (req, res) => {
    const { error } = movieValidation.validate(req.body);
    const genres = await Genre.find().sort({ name: 1 });

    if (error) {
        return res.status(400).render('add-movie', { genres, error: error.details[0].message });
    }

    const movie = await Movie.create({
        title: req.body.title,
        description: req.body.description,
        genre: req.body.genre,
        releaseYear: req.body.releaseYear,
        rating: req.body.rating,
        image: req.file ? '/uploads/' + req.file.filename : ''
    });

    res.redirect('/movies/' + movie._id);
});

app.get('/movies/:id', async (req, res) => {
    const movie = await Movie.findById(req.params.id).populate('genre');
    if (!movie) return res.status(404).send('Movie not found');

    const reviews = await Review.find({ movie: movie._id }).sort({ createdAt: -1 });
    res.render('movie-details', { movie, reviews, reviewCount: reviews.length });
});

app.get('/movies/:id/edit', async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    const genres = await Genre.find().sort({ name: 1 });
    if (!movie) return res.status(404).send('Movie not found');
    res.render('edit-movie', { movie, genres, error: null });
});

app.post('/movies/:id/edit', upload.single('image'), async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    const genres = await Genre.find().sort({ name: 1 });
    if (!movie) return res.status(404).send('Movie not found');

    const { error } = movieValidation.validate(req.body);
    if (error) return res.status(400).render('edit-movie', { movie, genres, error: error.details[0].message });

    Object.assign(movie, {
        title: req.body.title,
        description: req.body.description,
        genre: req.body.genre,
        releaseYear: req.body.releaseYear,
        rating: req.body.rating
    });

    if (req.file) movie.image = '/uploads/' + req.file.filename;

    await movie.save();
    res.redirect('/movies/' + movie._id);
});

app.post('/movies/:id/delete', async (req, res) => {
    await Review.deleteMany({ movie: req.params.id });
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect('/movies');
});

app.post('/movies/:id/reviews', async (req, res) => {
    const { error } = reviewValidation.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).send('Movie not found');

    await Review.create({
        movie: movie._id,
        username: req.body.username,
        rating: req.body.rating,
        comment: req.body.comment
    });

    res.redirect('/movies/' + movie._id);
});

app.post('/reviews/:id/delete', async (req, res) => {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).send('Review not found');
    res.redirect('/movies/' + review.movie);
});

app.post('/genres', async (req, res) => {
    if (!req.body.name || req.body.name.trim().length < 2) {
        return res.status(400).send('Genre name is required');
    }
    await Genre.create({ name: req.body.name.trim() });
    res.redirect('/movies/new');
});

mongoose.connect(config.connect.dbConnectString)
    .then(() => {
        console.log('MongoDB connected successfully');
        app.listen(config.connect.port, () => {
            console.log('Listening to port ' + config.connect.port);
        });
    })
    .catch(err => console.error('MongoDB connection error:', err.message));
