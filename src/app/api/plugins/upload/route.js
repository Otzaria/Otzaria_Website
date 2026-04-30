import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginUploadNotification } from '@/lib/emailService'

// יצירת slug מהשם
function createSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^\u0590-\u05FFa-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// המרת קובץ ל-Buffer
async function fileToBuffer(file) {
  const bytes = await file.arrayBuffer()
  return Buffer.from(bytes)
}

// POST - העלאת תוסף חדש
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login' },
        { status: 401 }
      )
    }
    
    const formData = await request.formData()
    
    // קבלת השדות
    const name = formData.get('name')
    const shortDescription = formData.get('shortDescription')
    const description = formData.get('description')
    const version = formData.get('version')
    const status = formData.get('status') || 'stable'
    const author = formData.get('author')
    const compatibleWith = formData.get('compatibleWith')
    const tags = formData.get('tags') ? JSON.parse(formData.get('tags')) : []
    const homepage = formData.get('homepage')
    const installInstructions = formData.get('installInstructions') 
      ? JSON.parse(formData.get('installInstructions')) 
      : []
    
    // קבלת הקבצים
    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots')
    
    // בדיקות
    if (!name || !shortDescription || !description || !version || !author || !compatibleWith || !pluginFile) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // בדיקה שקובץ התוסף הוא .otzplugin
    if (!pluginFile.name.endsWith('.otzplugin')) {
      return NextResponse.json(
        { error: 'Plugin file must be .otzplugin format' },
        { status: 400 }
      )
    }
    
    await dbConnect()
    
    // יצירת slug ייחודי
    let slug = createSlug(name)
    let counter = 1
    while (await Plugin.findOne({ slug })) {
      slug = `${createSlug(name)}-${counter}`
      counter++
    }
    
    // המרת קבצים ל-Buffers
    const pluginData = await fileToBuffer(pluginFile)
    const imageData = imageFile ? await fileToBuffer(imageFile) : null
    const imageContentType = imageFile ? imageFile.type : null
    
    const screenshots = []
    for (const screenshot of screenshotFiles) {
      if (screenshot && screenshot.size > 0) {
        screenshots.push({
          data: await fileToBuffer(screenshot),
          contentType: screenshot.type
        })
      }
    }
    
    // יצירת התוסף במסד הנתונים
    const plugin = await Plugin.create({
      name,
      slug,
      shortDescription,
      description,
      version,
      status,
      author,
      authorId: session.user.id,
      compatibleWith,
      tags,
      imageData,
      imageContentType,
      pluginData,
      pluginFileName: pluginFile.name,
      screenshots,
      homepage,
      installInstructions,
      isApproved: false // ממתין לאישור מנהל
    })
    
    // שליחת התראה למנהלים
    try {
      await sendPluginUploadNotification({
        pluginName: name,
        version: version,
        author: author,
        uploadedBy: session.user.name || session.user.email,
        uploaderEmail: session.user.email,
        shortDescription: shortDescription
      })
    } catch (emailError) {
      console.error('Failed to send plugin upload notification:', emailError)
      // ממשיכים גם אם שליחת המייל נכשלה
    }
    
    return NextResponse.json({
      success: true,
      message: 'Plugin uploaded successfully and waiting for approval',
      plugin: {
        id: plugin._id,
        name: plugin.name,
        slug: plugin.slug
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading plugin:', error)
    return NextResponse.json(
      { error: 'Failed to upload plugin', details: error.message },
      { status: 500 }
    )
  }
}
