var webpack = require('webpack');
var ExtractTextPlugin = require("extract-text-webpack-plugin");

module.exports = {
    entry: './src/front/index.js',
    output: {
        path: './public',
        publicPath: 'public/',
        filename: 'app.js',
    },
    module: {
        loaders: [
            { test: /\.jsx?$/,
                exclude: /node_modules/,
                loader: 'babel',
            },
            { test: /\.css$/,
                loader: ExtractTextPlugin.extract('style', 'css'),
            },
            { test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url?mimetype=application/font-woff'
            },
            { test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url?mimetype=application/octet-stream'
            },
            { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url?mimetype=application/octet-stream'
            },
            { test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url?mimetype=image/svg+xml'
            },
        ]
    },
    plugins: [new ExtractTextPlugin("app.css")]
 };
