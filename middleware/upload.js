import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer(
    {
        storage,
        limits: {
            fieldSize: 1 * 1024 * 1024 //5
        },
    }
)
export default upload 