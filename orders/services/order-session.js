import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import isExpired from "../../utils/isExpired.js";

export const orderSession = async (req, res) => {
    const id = +req.params.id;
    const lang = req.query.lang || 'en'
    try {
        if (isNaN(id)) { return }
        const session = await prisma.brandOrderSession.findUnique({
            where: { id },
            select: {
                id: true,
                amount: true,
                createdAt: true,
                expired: true,
                brandToken: {
                    select: {
                        expired: true,
                        brand: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                logo: true,
                                cover: true,
                                validTo: true
                            }
                        }
                    }
                }
            }
        });
        if (isExpired(session.createdAt, 30)) {
            return res.status(403).json({ message: getTranslation(lang, 'session_expired') });
        }
        if (session.expired) {
            return res.status(403).json({ message: getTranslation(lang, 'session_expired') });
        }
        if (session.brandToken.expired) {
            return res.status(403).json({ message: getTranslation(lang, 'session_expired') });
        }
        if (session.brandToken.brand.validTo < new Date()) {
            return res.status(403).json({ message: getTranslation(lang, 'session_expired') });
        }
        const data = { ...session, brand: session.brandToken.brand }
        delete data.brandToken
        return res.status(200).json({ session: data })
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: getTranslation(lang, 'internalError'), error: error.message })
    }
}