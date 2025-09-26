const express = require('express');
const { getProperties, getPropertyById, getPropertyAvailability } = require('../controllers/propertyController');
const { optionalAuth } = require('../middleware/auth');
const { createProperty } = require('../controllers/propertyController');

const router = express.Router();

const {  auth } = require('../middleware/auth');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validation');


// Validation rules for property creation
const propertyValidation = [
  body('title')
    .trim()
    .isLength({ min: 5 })
    .withMessage('Title must be at least 5 characters long'),
  body('description')
    .trim()
    .isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters long'),
  body('pricePerNight')
    .isFloat({ min: 0 })
    .withMessage('Price per night must be a positive number'),
  body('maxGuests')
    .isInt({ min: 1 })
    .withMessage('Maximum guests must be at least 1'),
  body('bedrooms')
    .isInt({ min: 1 })
    .withMessage('Bedrooms must be at least 1'),
  body('bathrooms')
    .isFloat({ min: 1 })
    .withMessage('Bathrooms must be at least 1'),
  body('address.street')
    .notEmpty()
    .withMessage('Street address is required'),
  body('address.city')
    .notEmpty()
    .withMessage('City is required'),
  body('address.state')
    .notEmpty()
    .withMessage('State is required'),
  body('address.country')
    .notEmpty()
    .withMessage('Country is required'),
  body('address.zipCode')
    .notEmpty()
    .withMessage('Zip code is required')
];

// Public routes - accessible to both guests and authenticated users

router.get('/', optionalAuth, getProperties);
router.get('/:id', optionalAuth, getPropertyById);
router.get('/:propertyId/availability', optionalAuth, getPropertyAvailability);
router.post('/', auth, propertyValidation, handleValidationErrors, createProperty);

module.exports = router;