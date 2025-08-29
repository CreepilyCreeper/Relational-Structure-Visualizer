const path = require('path');

module.exports = {
    entry: './src/js/main.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    mode: 'development',
    devServer: {
        static: {
            directory: path.resolve(__dirname, 'src'),
        },
        port: 8080,
        hot: true,
        open: true,
        compress: true,
    },
    resolve: {
        extensions: ['.js'],
    },
};