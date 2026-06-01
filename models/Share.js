const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    type: {
      type: String,
      enum: ['script', 'code'],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['bot-wa', 'telegram', 'discord', 'website', 'api', 'tool', 'template', 'other'],
      default: 'other',
      index: true
    },
    language: {
      type: String,
      default: 'javascript',
      trim: true
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true
    },
    shortDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 220
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    downloadUrl: {
      type: String,
      default: '',
      trim: true
    },
    code: {
      type: String,
      default: ''
    },
    tags: {
      type: [String],
      default: []
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true
    },
    views: {
      type: Number,
      default: 0
    },
    downloads: {
      type: Number,
      default: 0
    },
    copies: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Share || mongoose.model('Share', shareSchema);
