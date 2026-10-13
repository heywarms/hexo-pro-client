import React from "react"
import { useMemo, useState } from "react"
export type IRoute = {
  name: string
  key: string
  icon?: React.ReactNode,
  children?: IRoute[]
}


// export const routes: IRoute[] = [
//     {
//         key: 'posts',
//         name: 'menu.posts',
//         children: [
//             {
//                 name: 'menu.posts.blogs',
//                 key: 'content/posts/blogs',
//             },
//             {
//                 name: 'menu.posts.drafts',
//                 key: 'content/posts/drafts',
//             }
//         ],
//     },
//     {
//         name: 'menu.pages',
//         key: 'content/pages',
//     }
// ]

// // // 自定义钩子函数
// const useRoute = (): [IRoute[], string] => {

//     const [finalRoutes] = useState(routes)

//     const defaultRoute = useMemo(() => {
//         const first = finalRoutes[0]
//         if (first) {
//             const firstRoute = first?.children?.[0].key || first.key
//             return firstRoute
//         }
//         return ''
//     }, [finalRoutes])


//     return [finalRoutes, defaultRoute]
// }

export default function useRoute(): [IRoute[], string] {
  const routes = [
    {
      key: 'dashboard',
      name: 'menu.dashboard',
    },
    {
      key: 'content_management',
      name: 'menu.content_management',
      children: [
        {
          name: 'menu.posts',
          key: 'posts',
          children: [
            {
              name: 'menu.posts.blogs',
              key: 'content/posts/blogs',
            },
            {
              name: 'menu.posts.drafts',
              key: 'content/posts/drafts',
            },
            {
              name: 'menu.categories',
              key: 'content/categories',
            }

          ]
        },
        {
          name: 'menu.pages',
          key: 'content/pages',
        },
        // 添加图床管理路由
        {
          name: 'menu.content.images',
          key: 'content/images',
        },
        {
          name: 'menu.recycle',
          key: 'content/recycle',
        },
        // 添加YAML管理路由
        {
          name: 'menu.content.yaml',
          key: 'content/yaml',
        },
      ],
    },

    {
      name: 'menu.system',
      key: 'system',
      children: [
        {
          name: 'menu.deploy',
          key: 'deploy',
        },
        {
          name: 'menu.sync',
          key: 'sync',
        },
        {
          name: 'menu.themeMarket',
          key: 'theme-market',
        },
        {
          name: 'menu.settings',
          key: 'settings',
        }
      ],
    },
  ]

  const [finalRoutes] = useState(routes)

  const defaultRoute = useMemo(() => {
    const first = finalRoutes[0]
    if (first) {
      const firstRoute = first?.children?.[0].key || first.key
      return firstRoute
    }
    return ''
  }, [finalRoutes])


  return [finalRoutes, defaultRoute]
}

