import webpack from 'webpack'
import ExtractTextPlugin from 'extract-text-webpack-plugin'

export default {
    entry: './src/front/index.js',
    output: {
        path: './public',
        publicPath: 'public/',
        filename: 'release.js',
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
    plugins: [
        new webpack.optimize.UglifyJsPlugin({
            compress: {
                warnings: false,
            },
            output: {
                comments: false,
            },
        }),
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify("production")
            }
        }),
        new ExtractTextPlugin("release.css"),
    ]
 };
