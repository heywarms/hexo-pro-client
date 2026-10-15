import React from 'react'
import { Column } from '@ant-design/charts'

export default function PostTrend({ data, dark, label }: {
  data: { month: string; count: number }[]
  dark: boolean
  label: string
}) {
  const maximum = Math.max(1, ...data.map(item => item.count))
  return <Column
    data={data}
    xField="month"
    yField="count"
    height={180}
    color={dark ? '#91b8ff' : '#1677ff'}
    maxColumnWidth={36}
    columnStyle={{ radius: [4, 4, 0, 0] }}
    yAxis={{ min: 0, tickInterval: Math.max(1, Math.ceil(maximum / 4)) }}
    xAxis={{ label: { autoHide: false, formatter: value => value.slice(5) } }}
    tooltip={{ formatter: datum => ({ name: label, value: datum.count }) }}
    animation={false}
    theme={dark ? 'dark' : 'light'}
  />
}
