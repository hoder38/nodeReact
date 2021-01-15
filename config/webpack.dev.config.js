import webpack from 'webpack'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'

export default {
    entry: './src/front/index.js',
    output: {
        path: './public',
        publicPath: 'public/',
        filename: 'app.js',
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                styles: {
                    name: 'styles',
                    test: /\.css$/,
                    chunks: 'all',
                    enforce: true,
                },
            },
        },
    },
    module: {
        loaders: [
            { test: /\.jsx?$/,
                exclude: /node_modules/,
                loader: 'babel',
            },
            { test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
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
    plugins: [new MiniCssExtractPlugin({filename: 'app.css'})],
};